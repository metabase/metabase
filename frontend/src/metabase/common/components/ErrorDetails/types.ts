export type ErrorDetails = string | Record<string, any>;

export interface ErrorDetailsProps {
  details?: ErrorDetails;
  centered?: boolean;
  className?: string;
  /** Class applied to the inner error/stack-trace box (`ErrorBox`). */
  errorBoxClassName?: string;
}
