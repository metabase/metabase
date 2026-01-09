import { useGetChannelInfoQuery } from "metabase/api";

export const useHasAnyNotificationChannel = (): boolean => {
  const { data: channelInfo } = useGetChannelInfoQuery();

  return Object.values(channelInfo?.channels ?? {})?.some(
    (channel) => channel.configured,
  );
};

export const useHasEmailSetup = (): boolean => {
  const { data: channelInfo } = useGetChannelInfoQuery();

  return !!channelInfo?.channels?.email?.configured;
};

export const useHasSlackSetup = (): boolean => {
  const { data: channelInfo } = useGetChannelInfoQuery();

  return !!channelInfo?.channels?.slack?.configured;
};
