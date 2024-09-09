import { Position, Handle } from "reactflow";

const CustomNode = ({ id, data, isConnected }: any) => {
  return (
    <div
      style={{
        background: isConnected ? "#1A4D1A" : "#333",
        color: "#587330",
        padding: "10px",
        borderRadius: "5px",
        minWidth: "150px",
        transition: "all 0.3s ease",
        position: "relative", // Added to allow absolute positioning of children
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: "5px" }}>
        {data.label}
      </div>
      <hr style={{ margin: "5px 0", borderColor: "#555" }} />
      <div>Joins:</div>
      {data.fields.map((field: any, index: any) => (
        <div
          key={index}
          style={{
            fontSize: "0.8em",
            color: "#587330",
            position: "relative",
            paddingLeft: "15px",
            paddingRight: field.type === "source" ? "15px" : "0",
            marginBottom: "5px", // Added to give some vertical space between fields
          }}
        >
          {field.name}
          {field.hasHandle && (
            <Handle
              type={field.type}
              position={
                field.type === "target" ? Position.Left : Position.Right
              }
              id={field.name}
              style={{
                background: "#587330",
                width: 8,
                height: 8,
                [field.type === "target" ? "left" : "right"]: -4, // Moved slightly outside
                top: "50%",
                transform: "translateY(-50%)",
              }}
            />
          )}
        </div>
      ))}
      {data.showDefinition && (
        <>
          <div>Definitions:</div>
          <div>
            {Object.keys(data.cubeInfo.fields).map((key, index) => (
              <div
                key={index}
                style={{
                  fontSize: "0.8em",
                  color: "#587330",
                  position: "relative",
                  paddingLeft: "15px",
                  paddingRight:
                    data.cubeInfo.fields[key].type === "source" ? "15px" : "0",
                  marginBottom: "5px", // Added to give some vertical space between fields
                }}
              >
                {key}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default CustomNode;
