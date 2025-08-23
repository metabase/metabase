// Updated regex to support Unicode characters in email addresses  
// Based on RFC 6531 (Internationalized Email) and modern email standards
const EMAIL_REGEX =
  /^(([^\s@\"<>()[\]\\.,;:]+(\.[^\s@\"<>()[\]\\.,;:]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|([\p{L}\p{N}\-]+\.)+[\p{L}]{2,})$/u;

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
