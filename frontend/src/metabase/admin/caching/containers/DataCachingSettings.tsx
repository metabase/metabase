import { DataCachingSettingsMessage } from "./Caching.styled";

export const DataCachingSettings = () => {
  return (
    <div role="region" aria-label="Data caching settings">
      <DataCachingSettingsMessage>
        Cache the results of queries to have them display instantly. Here you
        can choose when cached results should be invalidated. You can set up one
        rule for all your databases, or apply more specific settings to each
        database.
      </DataCachingSettingsMessage>
      <div role="group">
        <div role="group">
          <button>
            Databases
            <button>Scheduled weekly</button>
          </button>
        </div>
        <div role="group">{/* List databases here */}</div>
        <div role="group">{/* Cache controls here */}</div>
      </div>
    </div>
  );
};
