
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { Observability, DefaultExporter, CloudExporter, SensitiveDataFilter } from '@mastra/observability';
import { registerApiRoute } from '@mastra/core/server';
import { graphicAbstractAgent } from './agents/graphic-abstract-agent';
import { extractGraphicAbstract } from './utils/extract';
import type { SchemaDefinition } from './utils/schema-builder';

const extractRoute = registerApiRoute('/extract', {
  method: 'POST',
  requiresAuth: false,
  handler: async (c) => {
    const body = await c.req.json() as { paper: string; schema: SchemaDefinition };

    if (!body.paper || !body.schema) {
      return c.json({ error: 'Missing required fields: paper, schema' }, 400);
    }

    const result = await extractGraphicAbstract({
      paper: body.paper,
      schema: body.schema,
    });

    return c.json(result, 200);
  },
});

export const mastra = new Mastra({
  agents: { graphicAbstractAgent },
  server: {
    apiRoutes: [extractRoute],
  },
  storage: new LibSQLStore({
    id: "mastra-storage",
    url: "file:./mastra.db",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new DefaultExporter(),
          new CloudExporter(),
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(),
        ],
      },
    },
  }),
});
