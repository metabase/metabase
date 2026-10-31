import {
  useAction,
  useMetabaseQuery,
} from "@metabase/embedding-sdk-react/data-app";
import { useState } from "react";

import { addTeam } from "./metabase.actions";
import { teamList } from "./metabase.queries";

export default function App() {
  const teams = useMetabaseQuery(teamList);
  const { execute, isExecuting, error } = useAction(addTeam);
  const [teamName, setTeamName] = useState("");

  const onAdd = async () => {
    await execute({ team_name: teamName });
    setTeamName("");
    await teams.refetch();
  };

  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>Teams</h1>
      <ul aria-label="Teams">
        {(teams.data?.rows ?? []).map((team) => (
          <li key={team.team_name}>
            {team.team_name}: {team.score}
          </li>
        ))}
      </ul>
      <label>
        Team name
        <input
          value={teamName}
          onChange={(event) => setTeamName(event.target.value)}
        />
      </label>
      <button type="button" disabled={isExecuting} onClick={onAdd}>
        Add team
      </button>
      {error ? <p role="alert">{String(error)}</p> : null}
    </main>
  );
}
