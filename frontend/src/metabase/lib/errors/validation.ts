import { t } from "ttag";

import type { LengthParams, MaxLengthParams } from "./types";

export const required = () => t`Required`;

export const email = () => t`Must be a valid email address`;

export const maxLength = ({ max }: MaxLengthParams) =>
  t`Must be ${max} characters or less`;

export const exactLength = ({ length }: LengthParams) =>
  t`Must be exactly ${length} characters`;

export const positive = () => t`Must be a positive integer value`;
