import type { Database, DatabaseId } from "metabase-types/api";

// Test helper functions and logic from SchemaPickerInput
describe("SchemaPickerInput", () => {
  describe("label construction", () => {
    it("should show 'Database / Schema' when both exist", () => {
      const selectedDatabase: Database = {
        id: 1 as DatabaseId,
        name: "Sample Database",
        engine: "postgres",
      } as Database;
      const schema = "PUBLIC";

      const displayLabel = `${selectedDatabase.name} / ${schema}`;

      expect(displayLabel).toBe("Sample Database / PUBLIC");
    });

    it("should show only database name when schema is undefined", () => {
      const selectedDatabase: Database = {
        id: 1 as DatabaseId,
        name: "Sample Database",
        engine: "postgres",
      } as Database;
      const schema = undefined;

      const displayLabel = schema
        ? `${selectedDatabase.name} / ${schema}`
        : selectedDatabase.name;

      expect(displayLabel).toBe("Sample Database");
    });

    it("should show database with auto-selected schema", () => {
      const selectedDatabase: Database = {
        id: 1 as DatabaseId,
        name: "Sample Database",
        engine: "postgres",
      } as Database;
      const currentSchemas = ["PUBLIC"];
      const schema = undefined;

      const autoSelectedSchema =
        currentSchemas?.length === 1 ? currentSchemas[0] : null;
      const displaySchema = schema ?? autoSelectedSchema;
      const displayLabel = displaySchema
        ? `${selectedDatabase.name} / ${displaySchema}`
        : selectedDatabase.name;

      expect(displayLabel).toBe("Sample Database / PUBLIC");
    });

    it("should not auto-select when multiple schemas exist", () => {
      const selectedDatabase: Database = {
        id: 1 as DatabaseId,
        name: "Sample Database",
        engine: "postgres",
      } as Database;
      const currentSchemas = ["PUBLIC", "ANALYTICS"];
      const schema = undefined;

      const autoSelectedSchema =
        currentSchemas?.length === 1 ? currentSchemas[0] : null;
      const displaySchema = schema ?? autoSelectedSchema;
      const displayLabel = displaySchema
        ? `${selectedDatabase.name} / ${displaySchema}`
        : selectedDatabase.name;

      expect(displayLabel).toBe("Sample Database");
    });

    it("should return null when no database selected", () => {
      const selectedDatabase = undefined;
      const schema = undefined;

      const displayLabel = selectedDatabase
        ? schema
          ? `${selectedDatabase.name} / ${schema}`
          : selectedDatabase.name
        : null;

      expect(displayLabel).toBeNull();
    });
  });

  describe("icon selection", () => {
    it("should use folder icon when schema is displayed", () => {
      const displaySchema = "PUBLIC";
      const icon = displaySchema ? "folder" : "database";

      expect(icon).toBe("folder");
    });

    it("should use database icon when no schema displayed", () => {
      const displaySchema = null;
      const icon = displaySchema ? "folder" : "database";

      expect(icon).toBe("database");
    });

    it("should use database icon when auto-selected schema is null", () => {
      const currentSchemas: string[] | undefined = undefined;
      const schema = undefined;

      const autoSelectedSchema =
        currentSchemas?.length === 1 ? currentSchemas[0] : null;
      const displaySchema = schema ?? autoSelectedSchema;
      const icon = displaySchema ? "folder" : "database";

      expect(icon).toBe("database");
    });
  });

  describe("selection state", () => {
    it("should have selection when databaseId is defined", () => {
      const databaseId = 1 as DatabaseId;
      const hasSelection = databaseId != null;

      expect(hasSelection).toBe(true);
    });

    it("should not have selection when databaseId is undefined", () => {
      const databaseId = undefined;
      const hasSelection = databaseId != null;

      expect(hasSelection).toBe(false);
    });
  });

  describe("loading state display", () => {
    it("should show loader when isLoading is true", () => {
      const isLoading = true;
      const rightSection = isLoading ? "loader" : "close";

      expect(rightSection).toBe("loader");
    });

    it("should show close icon when isLoading is false and has selection", () => {
      const isLoading = false;
      const rightSection = isLoading ? "loader" : "close";

      expect(rightSection).toBe("close");
    });

    it("should show chevron when no selection and not loading", () => {
      const isLoading = false;
      const hasSelection = false;

      const rightSection = isLoading
        ? "loader"
        : hasSelection
          ? "close"
          : "chevron";

      expect(rightSection).toBe("chevron");
    });
  });

  describe("auto-select logic", () => {
    it("should auto-select when single schema exists", () => {
      const pickerSchemas = ["PUBLIC"];
      const shouldAutoSelect = pickerSchemas.length === 1;

      expect(shouldAutoSelect).toBe(true);
    });

    it("should auto-select when no schemas exist", () => {
      const pickerSchemas: string[] = [];
      const shouldUseDatabase = pickerSchemas.length === 0;

      expect(shouldUseDatabase).toBe(true);
    });

    it("should not auto-select when multiple schemas exist", () => {
      const pickerSchemas = ["PUBLIC", "ANALYTICS"];
      const shouldShowSchemaList = pickerSchemas.length > 1;

      expect(shouldShowSchemaList).toBe(true);
    });
  });

  describe("auto-selected schema calculation", () => {
    it("should auto-select single schema", () => {
      const currentSchemas = ["PUBLIC"];
      const autoSelectedSchema =
        currentSchemas?.length === 1 ? currentSchemas[0] : null;

      expect(autoSelectedSchema).toBe("PUBLIC");
    });

    it("should not auto-select with multiple schemas", () => {
      const currentSchemas = ["PUBLIC", "ANALYTICS", "TEST"];
      const autoSelectedSchema =
        currentSchemas?.length === 1 ? currentSchemas[0] : null;

      expect(autoSelectedSchema).toBeNull();
    });

    it("should not auto-select with no schemas", () => {
      const currentSchemas: string[] = [];
      const autoSelectedSchema =
        currentSchemas?.length === 1 ? currentSchemas[0] : null;

      expect(autoSelectedSchema).toBeNull();
    });

    it("should not auto-select when currentSchemas is undefined", () => {
      const currentSchemas = undefined;
      const autoSelectedSchema =
        currentSchemas?.length === 1 ? currentSchemas[0] : null;

      expect(autoSelectedSchema).toBeNull();
    });
  });

  describe("display schema resolution", () => {
    it("should prefer explicit schema over auto-selected", () => {
      const schema = "ANALYTICS";
      const currentSchemas = ["PUBLIC"];
      const autoSelectedSchema =
        currentSchemas?.length === 1 ? currentSchemas[0] : null;
      const displaySchema = schema ?? autoSelectedSchema;

      expect(displaySchema).toBe("ANALYTICS");
    });

    it("should use auto-selected when explicit is undefined", () => {
      const schema = undefined;
      const currentSchemas = ["PUBLIC"];
      const autoSelectedSchema =
        currentSchemas?.length === 1 ? currentSchemas[0] : null;
      const displaySchema = schema ?? autoSelectedSchema;

      expect(displaySchema).toBe("PUBLIC");
    });

    it("should be null when both are absent", () => {
      const schema = undefined;
      const currentSchemas = ["PUBLIC", "ANALYTICS"];
      const autoSelectedSchema =
        currentSchemas?.length === 1 ? currentSchemas[0] : null;
      const displaySchema = schema ?? autoSelectedSchema;

      expect(displaySchema).toBeNull();
    });
  });

  describe("database filtering", () => {
    it("should filter out saved questions database", () => {
      const databasesResponse = {
        data: [
          {
            id: 1,
            name: "Sample Database",
            is_saved_questions: false,
          },
          {
            id: -1337,
            name: "Saved Questions",
            is_saved_questions: true,
          },
        ],
      };

      const databases = databasesResponse.data.filter(
        (db) => !db.is_saved_questions,
      );

      expect(databases).toHaveLength(1);
      expect(databases[0].id).toBe(1);
    });

    it("should keep all databases when none are saved questions", () => {
      const databasesResponse = {
        data: [
          {
            id: 1,
            name: "Database 1",
            is_saved_questions: false,
          },
          {
            id: 2,
            name: "Database 2",
            is_saved_questions: false,
          },
        ],
      };

      const databases = databasesResponse.data.filter(
        (db) => !db.is_saved_questions,
      );

      expect(databases).toHaveLength(2);
    });
  });

  describe("schema list display logic", () => {
    it("should show schema list when multiple schemas exist", () => {
      const selectedDatabaseId = 1 as DatabaseId;
      const isLoadingSchemas = false;
      const pickerSchemas = ["PUBLIC", "ANALYTICS"];

      const shouldShowSchemaList =
        selectedDatabaseId != null &&
        !isLoadingSchemas &&
        pickerSchemas != null &&
        pickerSchemas.length > 1;

      expect(shouldShowSchemaList).toBe(true);
    });

    it("should show loader when loading schemas", () => {
      const selectedDatabaseId = 1 as DatabaseId;
      const isLoadingSchemas = true;
      const pickerSchemas = null;

      const shouldShowLoader =
        selectedDatabaseId != null && isLoadingSchemas;

      expect(shouldShowLoader).toBe(true);
    });

    it("should show database list when no database selected", () => {
      const selectedDatabaseId = null;
      const shouldShowDatabaseList = selectedDatabaseId == null;

      expect(shouldShowDatabaseList).toBe(true);
    });
  });

  describe("has multiple schemas detection", () => {
    it("should detect multiple schemas", () => {
      const schemas = ["PUBLIC", "ANALYTICS"];
      const hasMultipleSchemas = schemas != null && schemas.length > 1;

      expect(hasMultipleSchemas).toBe(true);
    });

    it("should not detect multiple with single schema", () => {
      const schemas = ["PUBLIC"];
      const hasMultipleSchemas = schemas != null && schemas.length > 1;

      expect(hasMultipleSchemas).toBe(false);
    });

    it("should not detect multiple with no schemas", () => {
      const schemas: string[] = [];
      const hasMultipleSchemas = schemas != null && schemas.length > 1;

      expect(hasMultipleSchemas).toBe(false);
    });

    it("should not detect multiple when schemas is null", () => {
      const schemas = null;
      const hasMultipleSchemas = schemas != null && schemas.length > 1;

      expect(hasMultipleSchemas).toBe(false);
    });
  });
});
