export type ErrorDetails = string | Record<string, any>;

export interface ErrorDetailsProps {
  details?: ErrorDetails;
  centered?: boolean;
  className?: string;
}
