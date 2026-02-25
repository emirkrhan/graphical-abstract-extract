import { z } from 'zod';

/**
 * Supported field type definitions sent by the user at runtime.
 * Arrays use { type: "array", items: FieldDef }
 * Objects use { type: "object", properties: Record<string, FieldDef> }
 * Icons use { type: "icon", description: "..." } → AI returns a single English keyword (e.g. "virus")
 * Charts use { type: "chart", description: "...", current: { labels: [...], values: [...] } } → AI returns { labels, values }
 */
export type FieldDef =
  | { type: 'string'; nullable?: boolean; description?: string; words?: number }
  | { type: 'number'; nullable?: boolean }
  | { type: 'boolean'; nullable?: boolean }
  | { type: 'array'; items: FieldDef }
  | { type: 'object'; properties: Record<string, FieldDef> }
  | { type: 'icon'; description?: string }
  | { type: 'chart'; description?: string; current?: { labels: string[]; values: number[] } };

export type SchemaDefinition = Record<string, FieldDef>;

/**
 * Converts a plain JSON schema definition (sent by the user at runtime)
 * into a Zod schema that can be passed to agent.generate({ structuredOutput: { schema } }).
 */
export function buildZodSchema(definition: SchemaDefinition): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {
    // Injected first so the model reasons before filling content fields.
    // Strip this field before returning output to the caller.
    _reasoning: z.string().describe(
      'Before filling any field, briefly explain: which section of the paper each value comes from, and why this schema fits the paper. 2-4 sentences.'
    ),
  };
  for (const [key, fieldDef] of Object.entries(definition)) {
    shape[key] = buildField(fieldDef);
  }
  return z.object(shape) as z.ZodObject<Record<string, z.ZodTypeAny>>;
}

function buildField(field: FieldDef): z.ZodTypeAny {
  switch (field.type) {
    case 'string': {
      const parts: string[] = [];
      if (field.description) parts.push(field.description);
      if (field.words) {
        parts.push(`YOU MUST write exactly ${field.words} words. This is a hard requirement — not a suggestion. Writing more or fewer words is a failure.`);
      }
      const base = parts.length > 0 ? z.string().describe(parts.join(' ')) : z.string();
      return field.nullable ? base.nullable() : base;
    }
    case 'number': {
      const base = z.number();
      return field.nullable ? base.nullable() : base;
    }
    case 'boolean': {
      const base = z.boolean();
      return field.nullable ? base.nullable() : base;
    }
    case 'array': {
      return z.array(buildField(field.items));
    }
    case 'object': {
      const nested: Record<string, z.ZodTypeAny> = {};
      for (const [key, nestedField] of Object.entries(field.properties)) {
        nested[key] = buildField(nestedField);
      }
      return z.object(nested) as z.ZodObject<Record<string, z.ZodTypeAny>>;
    }
    case 'icon': {
      const desc = [
        field.description ?? '',
        'Return a single lowercase English keyword that best represents this element visually (e.g. "person", "virus", "hospital", "dna", "chart"). One word only. No punctuation.',
      ].filter(Boolean).join(' ');
      return z.string().describe(desc);
    }
    case 'chart': {
      const desc = [
        field.description ?? '',
        'Return labels and numeric values that best represent the key data from the paper for this chart.',
        field.current ? `Current data for reference: ${JSON.stringify(field.current)}` : '',
      ].filter(Boolean).join(' ');
      return z.object({
        labels: z.array(z.string()).describe('Chart category labels derived from the paper'),
        values: z.array(z.number()).describe('Numeric values corresponding to each label'),
      }).describe(desc);
    }
  }
}
