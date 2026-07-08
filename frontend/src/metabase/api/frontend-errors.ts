import { Api } from "./api";

export type FrontendErrorType = "component-crash" | "chart-render-error";

interface ReportFrontendErrorRequest {
  type: FrontendErrorType;
}

export const frontendErrorsApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    reportFrontendError: builder.mutation<void, ReportFrontendErrorRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/frontend-errors",
        body,
      }),
    }),
  }),
});

export const { useReportFrontendErrorMutation } = frontendErrorsApi;
