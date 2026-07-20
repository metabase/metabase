import { useState } from "react";

import {
  MetabaseProvider,
  defineMetabaseAuthConfig,
  useAction,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});

const CREATE_EVENT_ACTION_ID = 99;

type CreateEventParameters = { created_at: string };

function CreateEventButton() {
  const { execute } = useAction<CreateEventParameters>(CREATE_EVENT_ACTION_ID);
  const [datePickerValue, setDatePickerValue] = useState("2024-01-15T10:00");

  const onUtcClick = async () => {
    // [<snippet timestamp-utc>]
    await execute({ created_at: "2024-01-15T10:00:00Z" }); // 10:00 UTC — stored as 10:00
    // [<endsnippet timestamp-utc>]
  };

  const onClick = async () => {
    // [<snippet normalize-date>]
    const picked = new Date(datePickerValue);
    await execute({ created_at: picked.toISOString() }); // always Z-suffixed
    // [<endsnippet normalize-date>]
  };

  return (
    <div>
      <input
        type="datetime-local"
        value={datePickerValue}
        onChange={(e) => setDatePickerValue(e.target.value)}
      />
      <button onClick={onClick}>Create event from picker</button>
      <button onClick={onUtcClick}>Create event at fixed UTC</button>
    </div>
  );
}

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig}>
      <CreateEventButton />
    </MetabaseProvider>
  );
}
