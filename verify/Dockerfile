# Playwright's official image ships Node + browsers; we add Python for pytest.
# Browsers are already baked in, so skip the npm postinstall download.
FROM mcr.microsoft.com/playwright:v1.63.0-jammy
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Python test dependencies (FastAPI deps are included so the rule tests can
# import app.rules; no API server is started inside this image).
# requirements-dev.txt starts with "-r requirements.txt", so copy both.
COPY api/requirements.txt api/requirements-dev.txt /tmp/api-reqs/
RUN python3 -m pip install --no-cache-dir -r /tmp/api-reqs/requirements-dev.txt

# Install JS dependencies first for better layer caching. Browsers are skipped
# here because the base image already ships them.
COPY web/package.json web/package-lock.json /workspace/web/
RUN cd /workspace/web && npm ci

COPY api /workspace/api
COPY web /workspace/web
COPY verify/run-tests.sh /workspace/run-tests.sh
RUN chmod +x /workspace/run-tests.sh

CMD ["/workspace/run-tests.sh"]
