FROM python:3.12-slim

WORKDIR /app

COPY seed/pyproject.toml ./
COPY seed/seed ./seed
RUN pip install --no-cache-dir -e ".[dev]"

COPY seed/tests ./tests
COPY users.yaml ./users.yaml

CMD ["playground-ldap-seed"]
