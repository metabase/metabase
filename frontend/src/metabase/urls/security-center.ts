const ROOT_URL = "/admin/security-center";

export const securityCenter = () => ROOT_URL;

export const securityCenterNotifications = () =>
  `${ROOT_URL}?open=notifications`;

export const securityCenterAdvisories = () => `${ROOT_URL}/advisories`;

export const securityCenterHealthChecks = () => `${ROOT_URL}/health-checks`;
