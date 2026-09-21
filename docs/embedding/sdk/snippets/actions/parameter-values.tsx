import {
  MetabaseProvider,
  defineMetabaseAuthConfig,
  useAction,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});

const CREATE_PERSON_ACTION_ID = 1;

type CreatePersonParameters = {
  name: string;
  age: number;
  is_active: boolean;
  birth_date: string;
  created_at: string;
};

function CreatePersonButton() {
  const { execute } =
    useAction<CreatePersonParameters>(CREATE_PERSON_ACTION_ID);

  const onClick = async () => {
    // [<snippet primitives-and-dates>]
    await execute({
      name: "Jane", // string parameter
      age: 30, // number parameter
      is_active: true, // boolean parameter
      birth_date: "1995-04-22", // date parameter, ISO format
      created_at: "2024-01-15T10:00:00Z", // timestamp parameter, ISO with `Z` for UTC
    });
    // [<endsnippet primitives-and-dates>]
  };

  return <button onClick={onClick}>Create person</button>;
}

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig}>
      <CreatePersonButton />
    </MetabaseProvider>
  );
}
