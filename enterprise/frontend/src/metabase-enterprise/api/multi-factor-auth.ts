import { provideUserListTags } from "metabase/api/tags";
import type {
  MfaAdminOverview,
  MfaAdminUser,
  MfaEnrollResponse,
  MfaEnrolledUser,
  MfaStatus,
  MfaUserListRequest,
  MfaUserListResponse,
  UserId,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideMfaStatusTags,
  tag,
} from "./tags";

export const multiFactorAuthApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMfaAdminOverview: builder.query<MfaAdminOverview, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/mfa/admin/overview",
      }),
      providesTags: () => provideMfaStatusTags(),
    }),
    listEnrolledMfaUsers: builder.query<
      MfaUserListResponse<MfaEnrolledUser>,
      MfaUserListRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/mfa/admin/enrolled-users",
        params,
      }),
      providesTags: (response) =>
        response ? provideUserListTags(response.data) : [],
    }),
    listUnenrolledMfaUsers: builder.query<
      MfaUserListResponse<MfaAdminUser>,
      MfaUserListRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/mfa/admin/unenrolled-users",
        params,
      }),
      providesTags: (response) =>
        response ? provideUserListTags(response.data) : [],
    }),
    removeUserMfa: builder.mutation<void, { user_id: UserId }>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/mfa/admin/remove",
        body,
      }),
      invalidatesTags: (_, error, { user_id }) =>
        invalidateTags(error, [
          tag("mfa-status"),
          listTag("user"),
          idTag("user", user_id),
        ]),
    }),
    verifyMfa: builder.mutation<
      { id: string },
      { challenge_token: string; code: string; remember?: boolean }
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/session/mfa/verify",
        body,
      }),
    }),
    getMfaStatus: builder.query<MfaStatus, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/mfa/status",
      }),
      providesTags: () => provideMfaStatusTags(),
    }),
    enrollMfa: builder.mutation<MfaEnrollResponse, { password: string }>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/mfa/enroll",
        body,
      }),
    }),
    confirmMfaEnrollment: builder.mutation<
      { recovery_codes: string[] },
      { code: string }
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/mfa/enroll/confirm",
        body,
      }),
      invalidatesTags: (_, error) => invalidateTags(error, [tag("mfa-status")]),
    }),
    disableMfa: builder.mutation<void, { code: string }>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/mfa/disable",
        body,
      }),
      invalidatesTags: (_, error) => invalidateTags(error, [tag("mfa-status")]),
    }),
    sendEmailOtp: builder.mutation<
      { success: true },
      { challenge_token: string }
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/session/mfa/send-email-otp",
        body,
      }),
    }),
    regenerateRecoveryCodes: builder.mutation<
      { recovery_codes: string[] },
      { code: string }
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/mfa/recovery-codes",
        body,
      }),
      invalidatesTags: (_, error) => invalidateTags(error, [tag("mfa-status")]),
    }),
  }),
});

export const {
  useGetMfaAdminOverviewQuery,
  useListEnrolledMfaUsersQuery,
  useListUnenrolledMfaUsersQuery,
  useRemoveUserMfaMutation,
  useVerifyMfaMutation,
  useGetMfaStatusQuery,
  useEnrollMfaMutation,
  useConfirmMfaEnrollmentMutation,
  useDisableMfaMutation,
  useSendEmailOtpMutation,
  useRegenerateRecoveryCodesMutation,
} = multiFactorAuthApi;
