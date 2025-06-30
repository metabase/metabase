export interface EmailSMTPSettings {
  "email-smtp-host": string;
  "email-smtp-password": string | null;
  "email-smtp-port": number | null;
  "email-smtp-security": "none" | "ssl" | "tls" | "starttls";
  "email-smtp-username": string | null;
}

export interface CloudEmailSMTPSettings {
  "cloud-email-smtp-host": string;
  "cloud-email-smtp-password": string | null;
  "cloud-email-smtp-port": 465 | 587 | 2525;
  "cloud-email-smtp-security": "ssl" | "tls" | "starttls";
  "cloud-email-smtp-username": string | null;
}
