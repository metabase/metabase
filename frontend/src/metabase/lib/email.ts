const EMAIL_REGEX =
  /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export function isEmail(email: string | undefined | null) {
  if (email === null || email === undefined) {
    return false;
  }
  return EMAIL_REGEX.test(email);
}

export function getEmailDomain(email: string) {
  const match = EMAIL_REGEX.exec(email);
  return match && match[5];
}
