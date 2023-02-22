/**
 * Get user's full name, or an email address if name is not available.
 *
 * @param {Object} user
 * @returns string
 */
export function getFullName(user) {
  const { first_name, last_name, email } = user;

  if (first_name && last_name) {
    return `${first_name} ${last_name}`;
  }

  if (!first_name && !last_name) {
    return email;
  } else {
    return first_name || last_name;
  }
}
