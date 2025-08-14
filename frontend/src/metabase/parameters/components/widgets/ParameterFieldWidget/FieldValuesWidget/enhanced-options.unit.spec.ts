// Unit test for the enhanced options logic that fixes issue #62157

describe("Enhanced Options Logic for Required Parameters with Default Values", () => {
  // This test simulates the logic added to FieldValuesWidget.tsx
  const createEnhancedOptions = (
    options: Array<[string]>,
    parameter: { required?: boolean; default?: string } = {}
  ) => {
    if (!parameter?.required || !parameter?.default || !options.length) {
      return options;
    }

    // Check if default value is already in options
    const hasDefaultInOptions = options.some(option => {
      const optionValue = Array.isArray(option) ? option[0] : option;
      return optionValue === parameter.default;
    });

    if (hasDefaultInOptions) {
      return options;
    }

    // Add default value as an option if it's missing
    const defaultOption = [parameter.default] as [string];
    return [defaultOption, ...options];
  };

  it("should add missing default value for required parameters", () => {
    const options = [["Doohickey"], ["Widget"]];
    const parameter = { required: true, default: "Gadget" };
    
    const enhanced = createEnhancedOptions(options, parameter);
    
    expect(enhanced).toEqual([
      ["Gadget"], // Default value added first
      ["Doohickey"],
      ["Widget"]
    ]);
  });

  it("should not duplicate default value if already present", () => {
    const options = [["Doohickey"], ["Gadget"], ["Widget"]];
    const parameter = { required: true, default: "Gadget" };
    
    const enhanced = createEnhancedOptions(options, parameter);
    
    expect(enhanced).toEqual([
      ["Doohickey"],
      ["Gadget"], // Not duplicated
      ["Widget"]
    ]);
  });

  it("should not modify options for non-required parameters", () => {
    const options = [["Doohickey"], ["Widget"]];
    const parameter = { required: false, default: "Gadget" };
    
    const enhanced = createEnhancedOptions(options, parameter);
    
    expect(enhanced).toEqual([
      ["Doohickey"],
      ["Widget"] // No change
    ]);
  });

  it("should not modify options when parameter has no default", () => {
    const options = [["Doohickey"], ["Widget"]];
    const parameter = { required: true }; // No default
    
    const enhanced = createEnhancedOptions(options, parameter);
    
    expect(enhanced).toEqual([
      ["Doohickey"],
      ["Widget"] // No change
    ]);
  });

  it("should return original options when options array is empty", () => {
    const options: Array<[string]> = [];
    const parameter = { required: true, default: "Gadget" };
    
    const enhanced = createEnhancedOptions(options, parameter);
    
    expect(enhanced).toEqual([]); // No change for empty options
  });

  it("should work with various default value types", () => {
    // Test with different types of default values
    const options = [["Option1"], ["Option2"]];
    
    // String default
    let enhanced = createEnhancedOptions(options, { required: true, default: "DefaultString" });
    expect(enhanced[0]).toEqual(["DefaultString"]);
    
    // Number as string (common in filter contexts)
    enhanced = createEnhancedOptions([["1"], ["2"]], { required: true, default: "3" });
    expect(enhanced[0]).toEqual(["3"]);
  });
});