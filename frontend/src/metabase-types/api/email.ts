export interface EmailSMTPSettings {
  "email-smtp-host": string | null;
  "email-smtp-password": string | null;
  "email-smtp-port": number | null;
  "email-smtp-security": "none" | "ssl" | "tls" | "starttls";
  "email-smtp-username": string | null;
}
