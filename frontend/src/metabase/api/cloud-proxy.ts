import { Api } from "./api";

// Response types matching harbormaster/server/store/api.clj schemas

export interface TrialUpAvailableResponse {
  available: boolean;
  plan_alias: string;
}

export interface TrialUpResponse {
  status: string;
}

export interface ChangePlanPreviewResponse {
  amount_due_now: number; // cents
  next_payment_date?: string;
  next_payment_amount: number; // cents
  warnings?: string[];
}

export interface ChangePlanResponse {
  instance_status: string;
}

export interface GetPlanResponse {
  id: number;
  name: string;
  description: string;
  alias: string;
  product: string;
  price: string; // formatted, e.g. "$575.00"
  per_user_price: string; // formatted, e.g. "$12.00"
  users_included: number;
  trial_days: number;
  billing_period_months: number;
  can_purchase: boolean;
  token_features: string[];
  hosting_features: string[];
}

// Request types
interface ChangePlanRequest {
  new_plan_alias: string;
  force_end_trial?: boolean;
}

interface GetPlanRequest {
  plan_alias: string;
}

export const cloudProxyApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    checkTrialAvailable: builder.query<TrialUpAvailableResponse, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/cloud-proxy/mb-plan-trial-up-available",
        body: {},
      }),
    }),

    startTrial: builder.mutation<TrialUpResponse, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/cloud-proxy/mb-plan-trial-up",
        body: {},
      }),
    }),

    getChangePlanPreview: builder.query<
      ChangePlanPreviewResponse,
      ChangePlanRequest
    >({
      query: ({ new_plan_alias, force_end_trial }) => ({
        method: "POST",
        url: "/api/ee/cloud-proxy/mb-plan-change-plan-preview",
        body: {
          "new-plan-alias": new_plan_alias,
          ...(force_end_trial !== undefined && {
            "force-end-trial": force_end_trial,
          }),
        },
      }),
    }),

    changePlan: builder.mutation<ChangePlanResponse, ChangePlanRequest>({
      query: ({ new_plan_alias, force_end_trial }) => ({
        method: "POST",
        url: "/api/ee/cloud-proxy/mb-plan-change-plan",
        body: {
          "new-plan-alias": new_plan_alias,
          ...(force_end_trial !== undefined && {
            "force-end-trial": force_end_trial,
          }),
        },
      }),
    }),

    getPlan: builder.query<GetPlanResponse, GetPlanRequest>({
      query: ({ plan_alias }) => ({
        method: "POST",
        url: "/api/ee/cloud-proxy/get-plan",
        body: { "plan-alias": plan_alias },
      }),
    }),
  }),
});

export const {
  useCheckTrialAvailableQuery,
  useStartTrialMutation,
  useGetChangePlanPreviewQuery,
  useChangePlanMutation,
  useGetPlanQuery,
} = cloudProxyApi;
