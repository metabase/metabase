import { Flex, Stack, Text } from "metabase/ui";

window.trackedPromises ??= new Map();

export const trackPromiseGlobally = (promise, description, promiseId) => {
  window.trackedPromises.set(promiseId, {
    value: null,
    description,
    status: "pending",
  });
  promise
    .then(value => {
      window.trackedPromises.set(promiseId, {
        ...window.trackedPromises.get(promiseId),
        value,
        status: "resolved",
      });
    })
    .catch(reason => {
      window.trackedPromises.set(promiseId, {
        ...window.trackedPromises.get(promiseId),
        value: reason,
        status: "rejected",
      });
    });
};

export const DescriptionOfUpdate = ({
  title,
  newData,
}: {
  title: string;
  newData: Record<string, any>;
}) => {
  return (
    <Text>
      {title}
      <Stack gap="0">
        {Object.entries(newData).map(([key, value]) => (
          <Flex gap="sm" key={key}>
            <Text fw="normal" style={{ color: "#999" }}>
              {key}
            </Text>
            <Text fw="normal">{String(value)}</Text>
          </Flex>
        ))}
      </Stack>
    </Text>
  );
};
