import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Initialize server-side Gemini client with required 'aistudio-build' User-Agent
function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * POST /api/ai/analyze-hotspot-route
 * Analyzes candidate high-heatmap zones and routes from the courier's current starting point
 * to recommend the most profitable and efficient bicycle route.
 */
app.post('/api/ai/analyze-hotspot-route', async (req, res) => {
  try {
    const {
      candidates,
      weather,
      costPerKm,
      currentHour,
      dayPeriodLabel,
    } = req.body || {};

    if (!Array.isArray(candidates) || candidates.length === 0) {
      res.status(400).json({
        error: 'Nenhuma zona de alta demanda disponível para análise.',
      });
      return;
    }

    const ai = getGeminiClient();

    const prompt = `Você é um especialista em logística urbana e estratégia para entregadores ciclistas (bike couriers).
Analise as seguintes zonas de alta densidade de demanda (heatmap alto) a partir do ponto de partida atual do entregador e escolha a MELHOR opção de deslocamento e rota:

Horário atual: ${currentHour ?? new Date().getHours()}h (${dayPeriodLabel || 'Turno atual'})
Custo operacional da bicicleta: R$ ${Number(costPerKm ?? 0.35).toFixed(2)}/km
Clima atual: ${
      weather
        ? `${weather.temperatureC}°C, ${weather.conditionLabel}, Vento ${weather.windSpeedKmh} km/h, Chuva ${weather.precipitationMm} mm`
        : 'Estável'
    }

Zonas de Heatmap Alto Candidatas (calculadas a partir do GPS atual):
${JSON.stringify(candidates, null, 2)}

Avalie a relação entre:
1. Densidade de demanda no heatmap (concentração e peso de pedidos na zona)
2. Distância de deslocamento em km e tempo estimado de pedalada (Routes API)
3. Esforço físico do ciclista (vento/clima) e custo operacional por km até a zona
4. Potencial de corridas curtas em sequência ao chegar no cluster.

Retorne um JSON estruturado indicando o "selectedClusterId" (deve ser exatamente um dos IDs fornecidos em candidates) e a análise tática completa em português.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction:
          'Você é um consultor tático de rotas para entregadores de bicicleta. Responda sempre em português do Brasil de forma direta, prática e objetiva.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            selectedClusterId: {
              type: Type.STRING,
              description:
                'O ID exato do cluster recomendado dentre os candidatos.',
            },
            headline: {
              type: Type.STRING,
              description:
                'Título curto e direto da recomendação (ex: Melhor Relação Demanda vs. Pedal).',
            },
            reasoning: {
              type: Type.STRING,
              description:
                'Explicação prática de 2 frases sobre por que esta rota até a zona de heatmap alto é a mais vantajosa agora.',
            },
            pacingTip: {
              type: Type.STRING,
              description:
                'Dica de ritmo de pedalada, segurança ou posicionamento ao chegar na zona.',
            },
            estimatedRoiLabel: {
              type: Type.STRING,
              description:
                'Classificação de retorno esperado (ex: Alto Potencial de Giro Rápido).',
            },
            efficiencyScore100: {
              type: Type.INTEGER,
              description: 'Nota de eficiência tática de 1 a 100 para esta rota.',
            },
          },
          required: [
            'selectedClusterId',
            'headline',
            'reasoning',
            'pacingTip',
            'estimatedRoiLabel',
            'efficiencyScore100',
          ],
        },
      },
    });

    const text = (response.text ?? '{}').trim();
    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (error: unknown) {
    console.error('Erro na análise de rota por IA:', error);
    const errMsg =
      error instanceof Error
        ? error.message
        : 'Falha ao analisar rota por IA.';
    res.status(500).json({ error: errMsg });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Estação do Entregador server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
