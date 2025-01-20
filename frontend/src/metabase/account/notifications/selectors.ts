export const getAlertId = (rawAlertId: unknown) => {
  if (rawAlertId && typeof rawAlertId === "string") {
    return parseInt(rawAlertId);
  }

  return null;
};

export const getPulseId = ({
  params: { pulseId },
}: {
  params: { pulseId?: string };
}) => {
  return pulseId ? parseInt(pulseId) : null;
};
