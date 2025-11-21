import { verifyGmail } from "./utils-email-gmail";

export const handler = async () => {
  const res = await verifyGmail();
  return {
    statusCode: res.ok ? 200 : 500,
    body: JSON.stringify(res),
    headers: { "Content-Type": "application/json" },
  };
};

export default handler;
