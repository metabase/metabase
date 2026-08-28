// Host ports of the maildev instance used by e2e email tests. Overridable via MAILDEV_WEB_PORT / MAILDEV_SMTP_PORT
export const MAILDEV_WEB_PORT = Number(process.env.MAILDEV_WEB_PORT) || 1080;
export const MAILDEV_SMTP_PORT = Number(process.env.MAILDEV_SMTP_PORT) || 1025;
