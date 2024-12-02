import { useGetKeyValueQuery, useUpdateKeyValueMutation } from "metabase/api";
import type { GetUserKeyValueRequest } from "metabase-types/api";

export const useUserValue = ({
  context,
  key,
  defaultValue,
}: GetUserKeyValueRequest & {
  defaultValue: any;
}) => {
  const { data: value = defaultValue, isLoading } = useGetKeyValueQuery({
    context,
    key,
  });

  const [updateKeyValue, isMutating] = useUpdateKeyValueMutation();

  const setValue = (value: any) => {
    updateKeyValue({
      key,
      context,
      value,
    });
  };

  return {
    value,
    isLoading,
    setValue,
    isMutating,
  };
};
