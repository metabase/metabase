export const processUrl = (urlLike: string): string => {
  let processedUrl = urlLike.trim();

  if (!processedUrl.startsWith("/") && processedUrl.includes(".")) {
    const hasProtocol = /^\S+:\/\//.test(processedUrl);
    if (!hasProtocol) {
      const isEmailLike = /^\S+@\S+$/.test(processedUrl);
      if (!isEmailLike) {
        processedUrl = `https://${processedUrl}`;
      } else if (!processedUrl.startsWith("mailto:")) {
        processedUrl = `mailto:${processedUrl}`;
      }
    }
  }

  return processedUrl;
};
