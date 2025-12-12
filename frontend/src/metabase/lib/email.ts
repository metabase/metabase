// Enhanced email regex with Unicode support for international characters
// Uses Unicode character classes to support international domains and names
// Based on RFC 5322 with practical constraints for security and usability
const EMAIL_REGEX =
  /^(?=.{1,254}$)(?=.{1,64}@)[\p{L}\p{N}!#$%&'*+\/=?\^`{|}~_-]+(?:\.[\p{L}\p{N}!#$%&'*+\/=?\^`{|}~_-]+)*@([\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?)*)$/u;

export function isEmail(email: string | undefined | null): boolean {
  if (email === null || email === undefined) {
    return false;
  }
  return EMAIL_REGEX.test(email);
}

export function getEmailDomain(email: string) {
  const match = EMAIL_REGEX.exec(email);
  return match && match[1];
}
