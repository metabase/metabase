export interface EmailSMTPSettings {
  "email-smtp-host": string;
  "email-smtp-password": string | null;
  "email-smtp-port": number | null;
  "email-smtp-security": "none" | "ssl" | "tls" | "starttls";
  "email-smtp-username": string | null;
}

export interface EmailSMTPOverrideSettings {
  "email-smtp-host-override": string;
  "email-smtp-password-override": string | null;
  "email-smtp-port-override": 465 | 587 | 2525;
  "email-smtp-security-override": "ssl" | "tls" | "starttls";
  "email-smtp-username-override": string | null;
}
