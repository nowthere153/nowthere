// Firestore의 spots 컬렉션을 JSON으로 내보내는 백업 스크립트
// GitHub Actions에서 매일 자동으로 실행됩니다 (.github/workflows/backup-firestore.yml 참고)
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountJson) {
  console.error('환경변수 FIREBASE_SERVICE_ACCOUNT_KEY가 설정되어 있지 않습니다. GitHub 저장소 Secrets 등록을 확인해주세요.');
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJson);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function backupCollection(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  const docs = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    // Firestore Timestamp 등 JSON으로 바로 안 바뀌는 값들을 안전하게 변환
    const serialized = {};
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value.toDate === 'function') {
        serialized[key] = value.toDate().toISOString();
      } else {
        serialized[key] = value;
      }
    }
    docs.push({ id: doc.id, ...serialized });
  });
  return docs;
}

async function main() {
  const spots = await backupCollection('spots');

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const payload = { backedUpAt: now.toISOString(), count: spots.length, spots };

  // 날짜별 백업본 (히스토리 보존용)
  const outPath = path.join(backupDir, `spots-${dateStr}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

  // 가장 최근 백업을 항상 같은 파일명으로 바로 찾을 수 있도록 별도 저장
  const latestPath = path.join(backupDir, 'spots-latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(payload, null, 2));

  console.log(`백업 완료: ${spots.length}건 -> ${outPath}`);
}

main().catch((err) => {
  console.error('백업 실패:', err);
  process.exit(1);
});
