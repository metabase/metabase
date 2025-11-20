export const normalizeQuestionOrDashboardComponentProps = <
  TProps extends object,
>({
  hasLicense,
  props,
}: {
  hasLicense: boolean;
  props: Omit<TProps, "children">;
}): Omit<TProps, "children"> => {
  if (hasLicense) {
    return props;
  }

  const normalizedProps = { ...props };

  if ("withDownloads" in normalizedProps) {
    // For OSS usage we force downloads
    normalizedProps.withDownloads = true;
  }

  return normalizedProps;
};
