export const SUBSCRIBE_URL =
  "https://metabase.us10.list-manage.com/subscribe/post?u=869fec0e4689e8fd1db91e795&id=b9664113a8";
export const SUBSCRIBE_TOKEN = "b_869fec0e4689e8fd1db91e795_b9664113a8";

export const subscribeToNewsletter = async (email: string): Promise<void> => {
  const body = new FormData();
  body.append("EMAIL", email);
  body.append(SUBSCRIBE_TOKEN, "");

  await fetch(SUBSCRIBE_URL, { method: "POST", mode: "no-cors", body });
};
