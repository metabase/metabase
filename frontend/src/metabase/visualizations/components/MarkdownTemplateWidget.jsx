import React from "react";
import { t } from "ttag";

export default function MarkdownTemplateWidget({ value, onChange, placeholder }) {
  return (
    <div>
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || t`Enter your markdown template using {{variable_name}} syntax...`}
        style={{
          width: "100%",
          minHeight: "120px",
          padding: "8px",
          border: "1px solid #ccc",
          borderRadius: "4px",
          fontFamily: "monospace",
          fontSize: "13px",
          lineHeight: "1.4",
          resize: "vertical",
        }}
        rows={6}
      />
    </div>
  );
}