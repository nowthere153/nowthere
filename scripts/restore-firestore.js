// 백업 JSON(backups/spots-latest.json)을 읽어서 Firestore에 다시 써넣는 "복구 테스트" 스크립트.
//
// 안전을 위해 기본값은 실제 서비스가 쓰는 'spots' 컬렉션이 아니라 별도의
// 'spots_restore_test' 컬렉션에 복구합니다. 즉, 이 스크립트를 실행해도 실제
// 서비스 데이터에는 영향이 없습니다. 복구가 잘 되는지 확인만 하는 용도입니다.
//
// (진짜 장애 상황에서 실제 spots 컬렉션에 복구해야 한다면, 아래 RESTORE_TARGET_COLLECTION을
//  'spots'로 지정해서 실행하면 되지만, 이건 신중하게 사람이 직접 판단해서 실행해야 합니다.)
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountJson) {
  console.error('환경변수 FIREBASE_SERVICE_ACCOUNT_KEY가 설정되어 있지 않습니다.');
  process.exit(1);
}

const targetCollection = process.env.RESTORE_TARGET_COLLECTION || 'spots_restore_test';
const backupFile = process.env.RESTORE_SOURCE_FILE || path.join(__dirname, '..', 'backups', 'spots-latest.json');

if (!fs.existsSync(backupFile)) {
  console.error(`백업 파일을 찾을 수 없습니다: ${backupFile}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJson);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  const spots = backup.spots || [];

  console.log(`복구 대상 문서 ${spots.length}건 -> 컬렉션 "${targetCollection}"`);

  const batchSize = 400; // Firestore 배치 쓰기 한도(500) 여유 있게
  for (let i = 0; i < spots.length; i += batchSize) {
    const batch = db.batch();
    const chunk = spots.slice(i, i + batchSize);
    chunk.forEach((spot) => {
      const { id, ...data } = spot;
      const docRef = id ? db.collection(targetCollection).doc(id) : db.collection(targetCollection).doc();
      batch.set(docRef, data);
    });
    await batch.commit();
    console.log(`  ${Math.min(i + batchSize, spots.length)}/${spots.length}건 복구 완료`);
  }

  console.log(`복구 테스트 완료: ${spots.length}건이 "${targetCollection}" 컬렉션에 기록되었습니다.`);
  console.log('Firebase 콘솔 > Firestore Database 에서 해당 컬렉션의 문서 수가 백업 건수와 일치하는지 확인해주세요.');
  console.log('확인 후에는 이 테스트 컬렉션을 지워도 됩니다(실제 서비스와 무관한 검증용 데이터입니다).');
}

main().catch((err) => {
  console.error('복구 테스트 실패:', err);
  process.exit(1);
});
