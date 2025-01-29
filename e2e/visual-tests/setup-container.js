const Docker = require("dockerode");
const path = require("path");

const { runCommand } = require("./utils");

const cwd = path.resolve(__dirname, "../../");
const docker = new Docker();
let container;

const IMAGE_BASE_NAME = "metabase/cypress-runner";
const IMAGE_TAG = "latest";
const IMAGE_NAME = `${IMAGE_BASE_NAME}:${IMAGE_TAG}`;

const BUILD_ARGS = [
  `BINARY_ARCHITECTURE=${process.platform === "darwin" ? "arm64" : "x64"}`,
]
  .map(arg => ["--build-arg", arg])
  .flat();

const WORKING_DIRECTORY = "/app";
const CONTAINER_BOUND_DIRECTORIES = ["/"];
const CONTAINER_OVERRIDE_PACKAGES = ["esbuild", "@esbuild"];

const SUCCESS_EXIT_CODE = 0;
const ERROR_EXIT_CODE = 1;

module.exports.setupContainer = async function setupContainer(options) {
  const cleanup = prepareCleanup();

  const exists = await isDockerImageCreated(IMAGE_NAME);

  if (!exists) {
    await buildImage();
  }

  const exitCode = await runContainer(options);

  cleanup(exitCode);
};

async function isDockerImageCreated() {
  try {
    const images = await docker.listImages();

    const imageExists = images.some(image => {
      return image.RepoTags && image.RepoTags.includes(IMAGE_NAME);
    });

    return imageExists;
  } catch (error) {
    console.error("Error checking Docker image:", error);
    return false;
  }
}

async function buildImage() {
  const dockerfilePath = path.resolve(__dirname, "Dockerfile");

  const command = "docker";
  const args = [
    "build",
    ...BUILD_ARGS,
    "-t",
    IMAGE_NAME,
    "-f",
    dockerfilePath,
    cwd,
  ];

  console.log("Building Docker image...");
  console.log(`Command: docker ${args.join(" ")}`);

  try {
    await runCommand(command, args, {
      onClose: code => {
        if (code === 0) {
          return `Docker image built successfully: ${IMAGE_NAME}`;
        } else {
          return `Docker build failed with exit code ${code}`;
        }
      },
    });
  } catch (error) {
    console.error("Failed to build Docker image:", error.message);
  }
}

async function runContainer(options) {
  const { env = {}, command, after = [] } = options;

  try {
    container = await docker.createContainer({
      Image: IMAGE_BASE_NAME,
      Tty: true,
      Cmd: ["-c", command, ...after],
      HostConfig: {
        Binds: [
          ...CONTAINER_BOUND_DIRECTORIES.map(
            directory =>
              `${cwd}/${directory}:${WORKING_DIRECTORY}/${directory}`,
          ),
          ...CONTAINER_OVERRIDE_PACKAGES.map(
            (packageName, index) =>
              `override_${index}:/${WORKING_DIRECTORY}/node_modules/${packageName}`,
          ),
        ],
        ExtraHosts: ["host.docker.internal:host-gateway"],
      },
      WorkingDir: WORKING_DIRECTORY,
      Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
    });

    await container.start();

    container.attach(
      { stream: true, stdin: true, stdout: true, stderr: true },
      (err, stream) => {
        if (err) {
          console.error("Error attaching to container:", err);
          return;
        }
        stream.pipe(process.stdout);
      },
    );

    const waitResult = await container.wait();

    console.log("Container exited with status:", waitResult.StatusCode);

    await container.remove();

    return waitResult.StatusCode || SUCCESS_EXIT_CODE;
  } catch (error) {
    console.error("Error running container:", error);

    return ERROR_EXIT_CODE;
  }
}

function prepareCleanup() {
  const exit = exitCode => {
    process.exit(exitCode);
  };

  process.on("SIGINT", async () => {
    console.log("Received SIGINT. Cleaning up...");
    await cleanup(exit);
  });

  process.on("SIGTERM", async () => {
    console.log("Received SIGTERM. Cleaning up...");
    await cleanup(exit);
  });

  return exit;
}

async function cleanup(exit) {
  if (container) {
    try {
      console.log("Stopping container...");
      await container.stop();
      await container.remove();
      console.log("Container stopped and removed.");
    } catch (err) {
      console.error("Error stopping container:", err);
    }
  }

  exit(SUCCESS_EXIT_CODE);
}
