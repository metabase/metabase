import { useGetChannelInfoQuery } from "metabase/api";

export const useHasAnyNotificationChannel = () => {
  const { data: channelInfo } = useGetChannelInfoQuery();

  return Object.values(channelInfo?.channels ?? {})?.some(
    channel => channel.configured,
  );
};
