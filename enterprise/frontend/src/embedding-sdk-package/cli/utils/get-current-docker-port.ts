const PORT_REGEX = /(?:0\.0\.0\.0:|:::)(\d+)->3000\/tcp/g;

export function getCurrentDockerPort(ports: string): number | null {
  if (!ports || ports.length === 0) {
    return null;
  }

  let match;

  while ((match = PORT_REGEX.exec(ports)) !== null) {
    const port = parseInt(match[1], 10);

    if (!isNaN(port)) {
      return port;
    }
  }

  return null;
}
