import admin from "firebase-admin";

let app: admin.app.App | null = null;

export function getDB() {
  if (!app) {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!b64 || !projectId) throw new Error("Firebase env vars missing");

    const json = Buffer.from(b64, "base64").toString("utf8");
    const creds = JSON.parse(json);

    app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert(creds),
          projectId,
        });
  }
  return admin.firestore();
}

