import { ApiClient } from "../core-api/dist";

const basePath = "http://localhost:3000";
const API_KEY = "mb_7YOnDatXRGtRfpXCG8azN0To4NkiNw38NU7RB1RIH+Y=";

export const apiClient = new ApiClient(basePath);
apiClient.defaultHeaders = {
  "x-api-key": API_KEY,
};
