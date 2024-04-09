import { t } from "ttag";

export interface MaxLengthParams {
  max: number;
}

export const requiredErrorMessage = () => t`Required`;

export const emailErrorMessage = () => t`Must be a valid email address`;

export const maxLengthErrorMessage = ({ max }: MaxLengthParams) =>
  t`Must be ${max} characters or less`;

export const positiveErrorMessage = () => t`Must be a positive integer value`;
