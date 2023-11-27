import { t } from "ttag";
import type { MaxLengthParams } from "./types";

export const required = () => t`required`;

export const email = () => t`must be a valid email address`;

export const maxLength = ({ max }: MaxLengthParams) =>
  t`must be ${max} characters or less`;

export const positive = () => t`must be a positive integer value`;
