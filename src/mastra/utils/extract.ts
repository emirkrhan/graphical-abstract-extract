import { graphicAbstractAgent } from '../agents/graphic-abstract-agent';
import { buildZodSchema, SchemaDefinition } from './schema-builder';

export interface ExtractionInput {
  /** Full text, abstract, or structured excerpt of the academic paper */
  paper: string;
  /** Output format definition sent by the caller at runtime */
  schema: SchemaDefinition;
}

/**
 * Extracts graphic abstract content from an academic paper.
 * Forces the model to return a JSON object that strictly matches the provided schema
 * using Mastra's structuredOutput (→ OpenAI response_format under the hood).
 *
 * @returns Validated object typed to the provided schema. Never returns free text.
 */
export async function extractGraphicAbstract(input: ExtractionInput): Promise<unknown> {
  const { paper, schema } = input;

  const zodSchema = buildZodSchema(schema);
  const wordLimits = collectWordLimits(schema);

  const wordLimitBlock = wordLimits.length > 0
    ? `\n<word_limits>\nCRITICAL: Each field below MUST be written in EXACTLY the specified number of words. Not approximately. Not fewer. Not more. The exact count is mandatory — any deviation is a failure:\n${wordLimits.map(({ field, max }) => `- "${field}": EXACTLY ${max} words`).join('\n')}\n</word_limits>\n`
    : '';

  const prompt = `<paper>
${paper}
</paper>

<output_schema>
${JSON.stringify(schema, null, 2)}
</output_schema>
${wordLimitBlock}
Extract the graphic abstract content from the paper above. Fill every field in the output schema using only information found in the paper.`;

  const result = await graphicAbstractAgent.generate(prompt, {
    structuredOutput: { schema: zodSchema },
  });

  // Strip the internal _reasoning field before returning to caller
  const { _reasoning: _, ...output } = result.object as Record<string, unknown>;
  return output;
}

/** Collects all string fields that have a words constraint, flattened with dot notation keys. */
function collectWordLimits(
  schema: SchemaDefinition,
  prefix = ''
): { field: string; max: number }[] {
  const results: { field: string; max: number }[] = [];
  for (const [key, def] of Object.entries(schema)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (def.type === 'string' && def.words) {
      results.push({ field: fullKey, max: def.words });
    } else if (def.type === 'object') {
      results.push(...collectWordLimits(def.properties, fullKey));
    }
  }
  return results;
}
