import { c, t } from "ttag";

import type { LengthParams, MaxLengthParams } from "./types";

export const required = () => t`required`;

export const email = () => t`must be a valid email address`;

export const maxLength = ({ max }: MaxLengthParams) =>
  c("{0} is a number greater than 1").t`must be ${max} characters or less`;

export const exactLength = ({ length }: LengthParams) =>
  c("{0} is a number greater than 1").t`must be exactly ${length} characters`;

export const positive = () => t`must be a positive integer value`;
