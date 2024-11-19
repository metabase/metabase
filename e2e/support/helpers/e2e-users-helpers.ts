interface User {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
}
/**
 * Get user's full name, or an email address if name is not available.
 */
export function getFullName(user: User): string {
  const { first_name, last_name, email } = user;

  if (first_name && last_name) {
    return `${first_name} ${last_name}`;
  }

  if (first_name) {
    return first_name;
  }

  if (last_name) {
    return last_name;
  }

  return email;
}
