// Host ports of the maildev instance used by e2e email tests. Overridable via MAILDEV_WEB_PORT / MAILDEV_SMTP_PORT
const getEnvPort = (name: string, defaultPort: number): number => {
  const port = Number(process.env[name]);
  return Number.isInteger(port) && port > 0 ? port : defaultPort;
};

export const MAILDEV_WEB_PORT = getEnvPort("MAILDEV_WEB_PORT", 1080);
export const MAILDEV_SMTP_PORT = getEnvPort("MAILDEV_SMTP_PORT", 1025);
