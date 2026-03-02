import fetchMock from "fetch-mock";

export interface TrialAvailableResponse {
  available: boolean;
  plan_alias: string;
}

export interface ChangePlanPreviewResponse {
  amount_due_now: number;
  next_payment_date: string;
  next_payment_amount: number;
  warnings: string[] | null;
}

export interface GetPlanResponse {
  id: number;
  name: string;
  description: string;
  alias: string;
  product: string;
  price: string;
  per_user_price: string;
  users_included: number;
  trial_days: number;
  billing_period_months: number;
  can_purchase: boolean;
  token_features: string[];
  hosting_features: string[];
}

export function setupTrialAvailableEndpoint(
  response: TrialAvailableResponse,
): void {
  fetchMock.post(
    "path:/api/ee/cloud-proxy/mb-plan-trial-up-available",
    response,
    { name: "cloud-proxy-trial-available" },
  );
}

export function setupChangePlanPreviewEndpoint(
  response: ChangePlanPreviewResponse,
): void {
  fetchMock.post(
    "path:/api/ee/cloud-proxy/mb-plan-change-plan-preview",
    response,
    { name: "cloud-proxy-change-plan-preview" },
  );
}

export function setupGetPlanEndpoint(response: GetPlanResponse): void {
  fetchMock.post("path:/api/ee/cloud-proxy/get-plan", response, {
    name: "cloud-proxy-get-plan",
  });
}

export function setupStartTrialEndpoint(): void {
  fetchMock.post("path:/api/ee/cloud-proxy/mb-plan-start-trial", 200, {
    name: "cloud-proxy-start-trial",
  });
}

export function setupChangePlanEndpoint(): void {
  fetchMock.post("path:/api/ee/cloud-proxy/mb-plan-change-plan", 200, {
    name: "cloud-proxy-change-plan",
  });
}
