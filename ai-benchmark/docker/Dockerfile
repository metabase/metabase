FROM pgvector/pgvector:pg17

# Install Java 21, supervisor, and curl
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    supervisor \
    curl \
    && wget -O- https://apt.corretto.aws/corretto.key | gpg --dearmor -o /usr/share/keyrings/corretto-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/corretto-keyring.gpg] https://apt.corretto.aws stable main" | tee /etc/apt/sources.list.d/corretto.list \
    && apt-get update \
    && apt-get install -y java-21-amazon-corretto-jdk \
    && rm -rf /var/lib/apt/lists/*

# Build arg for Metabase version (required, set by build script)
ARG METABASE_VERSION

# Download Metabase Enterprise
RUN mkdir -p /app && \
    echo "Downloading Metabase ${METABASE_VERSION}..." && \
    curl -L -o /app/metabase.jar \
    https://downloads.metabase.com/enterprise/${METABASE_VERSION}/metabase.jar

# Initialize Postgres data directory
RUN mkdir -p /var/lib/postgresql/data && \
    chown -R postgres:postgres /var/lib/postgresql && \
    chmod 700 /var/lib/postgresql/data && \
    su - postgres -c "/usr/lib/postgresql/17/bin/initdb -D /var/lib/postgresql/data"

# Configure Postgres for external connections
RUN echo "host all all 0.0.0.0/0 md5" >> /var/lib/postgresql/data/pg_hba.conf && \
    sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /var/lib/postgresql/data/postgresql.conf

# Create users and database at build time
RUN su - postgres -c "/usr/lib/postgresql/17/bin/pg_ctl -D /var/lib/postgresql/data -l /var/log/postgresql/logfile start" && \
    sleep 3 && \
    su - postgres -c "psql -c \"ALTER USER postgres WITH PASSWORD 'postgres';\"" && \
    su - postgres -c "psql -c \"CREATE USER metabase WITH PASSWORD 'metabase';\"" && \
    su - postgres -c "psql -c \"CREATE DATABASE metabase OWNER metabase;\"" && \
    su - postgres -c "psql -c \"CREATE DATABASE mb_semantic_search OWNER postgres;\"" && \
    su - postgres -c "/usr/lib/postgresql/17/bin/pg_ctl -D /var/lib/postgresql/data stop"

# Copy configuration files
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY entrypoint.sh /app/entrypoint.sh

# Make entrypoint executable
RUN chmod +x /app/entrypoint.sh

# Create log directory for postgres
RUN mkdir -p /var/log/postgresql && chown postgres:postgres /var/log/postgresql

# Environment variables for Metabase
ENV MB_DB_TYPE=postgres \
    MB_DB_HOST=localhost \
    MB_DB_PORT=5432 \
    MB_DB_DBNAME=metabase \
    MB_DB_USER=metabase \
    MB_DB_PASS=metabase \
    MB_LOAD_SAMPLE_CONTENT=false \
    METASTORE_DEV_SERVER_URL=https://token-check.staging.metabase.com \
    MB_RUN_MODE=dev \
    MB_STORE_USE_STAGING=true \
    JAVA_OPTS="-Xmx2g -Xms2g" \
    # Semantic search configuration
    MB_SEARCH_ENGINE=semantic \
    MB_PGVECTOR_DB_URL='jdbc:postgres://localhost:5432/mb_semantic_search?user=postgres&password=postgres'

EXPOSE 3000 5432

# Start via entrypoint which starts supervisor
CMD ["/app/entrypoint.sh"]
