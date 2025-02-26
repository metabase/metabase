export const getAlertId = (rawAlertId: unknown): number | null => {
  if (rawAlertId && typeof rawAlertId === "string") {
    return parseInt(rawAlertId, 10);
  }

  return null;
};

export const getPulseId = ({
  params: { pulseId },
}: {
  params: { pulseId?: string };
}): number | null => {
  return pulseId ? parseInt(pulseId, 10) : null;
};
