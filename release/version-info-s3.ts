import path from "node:path";

import { $ } from "zx";

$.verbose = false;

export function getVersionInfoAwsEnv(): {
  bucket: string;
  distributionId: string;
} {
  const bucket = process.env.AWS_S3_STATIC_BUCKET;
  const distributionId = process.env.AWS_CLOUDFRONT_STATIC_ID;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!bucket || !distributionId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "You must provide AWS_S3_STATIC_BUCKET, AWS_CLOUDFRONT_STATIC_ID, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY",
    );
  }

  return { bucket, distributionId };
}

export async function publishVersionInfoFiles({
  files,
  bucket,
  distributionId,
}: {
  files: readonly string[];
  bucket: string;
  distributionId: string;
}): Promise<void> {
  for (const file of files) {
    const name = path.basename(file);
    await $`aws s3 cp ${file} s3://${bucket}/${name}`.pipe(process.stdout);
  }

  const cloudFrontPaths = files.map((file) => `/${path.basename(file)}`);
  await $`aws cloudfront create-invalidation --distribution-id ${distributionId} --paths ${cloudFrontPaths}`.pipe(
    process.stdout,
  );
}
