import { getErrorInfo, SdkErrorStatus } from "embedding-sdk/lib/error/data";

interface MetabaseSdkErrorProps {
  title: any;
  description: any;
  link: any;
  statusCode: any;
}

export class MetabaseSdkError extends Error {
  title: string;
  description?: string;
  link?: string;
  statusCode: string;

  constructor({ title, description, link, statusCode }: MetabaseSdkErrorProps) {
    super(description);
    this.name = "CustomError";
    this.title = title;
    this.description = description;
    this.link = link;
    this.statusCode = statusCode;
  }
}

export const handleServerError = (statusCode: SdkErrorStatus) => {
  const { title, description, link } = getErrorInfo(statusCode);
  const error = new MetabaseSdkError({
    title,
    description,
    link,
    statusCode,
  });

  // Capture the stack trace and remove this function call
  Error.captureStackTrace(error, handleServerError);

  console.error(
    `Error ${error.statusCode}: ${error.title}\n`,
    `Description: ${error.description}\n`,
    `More info: ${error.link}\n`,
    error.stack,
  );

  throw error;
};