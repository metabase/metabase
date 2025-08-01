// email settings, why aren't they in the settings endpoint? who knows? ¯\_(ツ)_/¯
import fetchMock from "fetch-mock";

const defaultSettings = {
  "email-smtp-host": "smtp.rotom.test",
  "email-smtp-port": 587,
  "email-smtp-security": "tls",
  "email-smtp-username": "misty@rotom.test",
  "email-smtp-password": "iheartpikachu",
};

export const setupEmailEndpoints = (settings = defaultSettings) => {
  fetchMock.put("path:/api/email", settings);
  fetchMock.post("path:/api/email/test", 204, { name: "email-test" });
  fetchMock.delete("path:/api/email", 204);
};

export const setupEmailOverrideEndpoints = (settings = defaultSettings) => {
  fetchMock.put("path:/api/ee/email/override", settings);
  fetchMock.delete("path:/api/ee/email/override", 204);
};
