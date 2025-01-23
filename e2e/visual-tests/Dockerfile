# Start from the official Cypress image (headless Chrome + Node + Cypress pre-installed)
FROM cypress/included:13.9.0

# Set environment variables to suppress interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Fix architecture and install OpenJDK
RUN dpkg --add-architecture amd64 && \
    apt-get update && apt-get upgrade -y && \
    # Ensure man directory exists to avoid symbolic link error
    mkdir -p /usr/share/man/man1 && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        ca-certificates-java \
        openjdk-11-jdk \
        python3 \
        make \
        gcc \
        g++ \
        chromium

RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set JAVA_HOME environment variable
ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
ENV PATH=$JAVA_HOME/bin:$PATH

# Set working directory
WORKDIR /app

COPY . .

RUN yarn --frozen-lockfile

# Default command
ENTRYPOINT ["/bin/bash"]
