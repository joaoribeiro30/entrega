# Estação do Entregador — Bike Courier Workstation

Uma estação de trabalho web mobile-first de alta performance projetada especificamente para entregadores ciclistas (bike couriers), integrando mapa interativo de demanda em tempo real, rastreamento GPS de entregas com um toque, calculadora de rotas cicloviárias multi-paradas e controle financeiro completo com cálculo de lucro líquido.

## User Review & Critical Decisions

> [!IMPORTANT]
> As decisões abaixo refletem diretamente as suas escolhas confirmadas e definem o comportamento padrão da aplicação:

- **Modal Exclusivo para Bicicleta (Confirmado)**: Toda a experiência de navegação, a calculadora de rotas multi-paradas (`travelMode: 'BICYCLING'`) e as camadas do mapa priorizam o entregador de bicicleta, incluindo suporte visual à malha cicloviária, trânsito e condições climáticas críticas para quem pedala (vento e chuva).
- **Cálculo de Custo por Km e Lucro Líquido (Confirmado)**: Além de separar o valor base da entrega e as gorjetas, o sistema inclui uma configuração de custo operacional por km (manutenção da relação/freios, pneus e alimentação), exibindo tanto a receita bruta quanto o **Lucro Líquido Real** por entrega e no fechamento diário, semanal, mensal e geral.
- **Histórico Inicial Zerado e GPS Real (Confirmado)**: O aplicativo inicia com o banco de dados local limpo (sem entregas fictícias pré-carregadas) e opera diretamente com o GPS real do dispositivo (`navigator.geolocation.watchPosition` em modo de alta precisão).

---

## 1. Overview & Core Concept

- **O Que Faz**: Centraliza em uma única tela ágil o radar de zonas de alta demanda de restaurantes, o velocímetro/odômetro de entrega em andamento com desenho de trajeto ao vivo, o registro rápido de ganhos por aplicativo (iFood, Uber Eats, Rappi, Outro) e a análise de rentabilidade por quilômetro pedalado e por região.
- **Público-Alvo & Contexto de Uso**: Entregadores de bicicleta que operam o celular fixado no suporte de guidão ou com apenas uma mão entre coletas e entregas, precisando de leitura instantânea sob sol forte ou à noite e botões de ação grandes na base da tela.
- **Valor Principal**: Reduzir o atrito de registrar corridas para um único toque, descobrir onde estão os restaurantes abertos com maior movimento e saber exatamente quanto dinheiro sobra livre após descontar o desgaste por quilômetro pedalado.

---

## 2. User Experience & Visual Design

### Fluxos Principais do Usuário
1. **Radar e Mapa Ao Vivo (Estado Inicial)**: Ao abrir o app, o mapa centraliza automaticamente na posição GPS atual do ciclista, carrega o clima local no topo e exibe os controles rápidos de camadas (Heatmap de Restaurantes, Meus Pontos/Heatmap Pessoal, Ciclovias/Trânsito e Clima) junto aos filtros de restaurantes (Aberto agora, Avaliação mínima e Tipo de culinária).
2. **Ciclo de Entrega com 1 Toque ("Entrega em Andamento")**:
   - Na zona inferior do polegar, o botão de destaque **"Iniciar Entrega"** inicia imediatamente o `watchPosition` e o cronômetro.
   - Um painel compacto de telemetria exibe o **Tempo Decorrido** e os **Km Pedalados** em tempo real enquanto a linha da rota é desenhada ao vivo no mapa.
   - Ao tocar em **"Finalizar Entrega"**, o rastreamento é encerrado e abre-se uma gaveta inferior (*bottom sheet*) com distância, duração e bairro já preenchidos automaticamente; o entregador digita apenas o valor da corrida, gorjeta (opcional) e seleciona o app (iFood, Uber Eats, Rappi, Outro) com botões largos.
   - Também há um botão rápido **"+ Entrega Manual"** para lançar corridas passadas sem precisar do rastreamento GPS.
3. **Metas Diárias e Alertas**: O cabeçalho compacto monitora em tempo real as barras de progresso da **Meta Diária de Ganhos (R$)** e da **Meta de Quilometragem (km)**. Ao atingir 100% de qualquer meta, o sistema dispara um alerta sonoro sintetizado (Web Audio API), notificação visual comemorativa e notificação nativa do navegador.
4. **Replay de Trajeto e Gestão**: Na aba de Histórico/Estatísticas, cada entrega registrada permite editar dados, excluir ou tocar em **"Ver Replay"** — o que retorna ao mapa e reproduz de forma animada o caminho exato percorrido naquela entrega com controles de reprodução e velocidade.

### Identidade Visual & Tema
- **Direção Estética**: *Utilitarian Tactical Cockpit* — interface limpa, de altíssimo contraste e zero distrações visuais, desenhada para leitura rápida em movimento (guidão da bike) e operação com o polegar.
- **Paleta de Cores & Atmosfera (Modo Escuro Padrão + Modo Claro Diurno)**:
  - **Superfícies Neutras (60%)**: Fundo principal em ardósia profunda (`#0B0F17` no modo escuro / `#F8FAFC` no modo claro) para economizar bateria em telas OLED e evitar ofuscamento noturno.
  - **Superfícies Estruturais (30%)**: Painéis e *bottom sheets* em `#111827` / `#FFFFFF` com bordas finas de 1px (`#1E293B` / `#E2E8F0`).
  - **Acentos Funcionais (10%)**:
    - **Verde Esmeralda (`#10B981`)**: Ação primária ("Iniciar Entrega", Lucro Líquido, Meta Atingida).
    - **Âmbar Vibrante (`#F59E0B`)**: Status de "Entrega em Andamento", alertas climáticos e destaques de gorjeta.
    - **Vermelho Coral (`#EF4444`)**: Botão "Finalizar Entrega" e indicadores de alta densidade no heatmap.
- **Tipografia & Hierarquia**:
  - **Display & Títulos**: `Outfit` (pesos 600 e 700) para cabeçalhos nítidos e botões de ação rápida.
  - **Corpo & Controles**: `Plus Jakarta Sans` (pesos 400 e 500) para excelente legibilidade em telas móveis.
  - **Telemetria, Odômetro & Valores Financeiros**: `JetBrains Mono` com `tabular-nums` obrigatório em todos os contadores de km, cronômetros e valores em R$ para evitar oscilação de layout durante a atualização ao vivo.
- **Ergonomia Mobile & Responsividade**:
  - Todos os botões interativos possuem área de toque mínima de `48x48px`.
  - Navegação principal ancorada na barra inferior (zona natural do polegar no celular) e expandida em um layout de painel duplo (`Mapa Interativo` à esquerda + `Estação de Controle / Estatísticas` à direita) em telas desktop.

---

## 3. Key Product Decisions & Trade-Offs

- **Decisão 1: Renderização de Mapas de Calor (Heatmaps) e Marcadores**
  - *Abordagem Escolhida*: Utilizar `@vis.gl/react-google-maps` combinado com camadas de visualização de densidade em Canvas/Deck.gl (`GoogleMapsOverlay` + `HeatmapLayer`) e `AdvancedMarkerElement` para pontos de entrega e restaurantes.
  - *Por quê*: O antigo `google.maps.visualization.HeatmapLayer` e o antigo `google.maps.Marker` foram descontinuados na Google Maps Platform. A abordagem moderna garante compatibilidade total, alta taxa de quadros no celular e filtros instantâneos por avaliação, horário de funcionamento e categoria de comida.
- **Decisão 2: Cálculo de Distância Real com Filtro de Ruído de GPS**
  - *Abordagem Escolhida*: Rastrear coordenadas com `navigator.geolocation.watchPosition({ enableHighAccuracy: true })` aplicando um filtro de precisão (`accuracy <= 40m`) e deslocamento mínimo (`>= 5 metros`) antes de somar à quilometragem via fórmula de Haversine.
  - *Por quê*: Evita que oscilações naturais do sinal de GPS enquanto o ciclista aguarda o pedido no restaurante inflamem artificialmente a quilometragem rodada.
- **Decisão 3: Persistência Local Transparente e Portabilidade Total**
  - *Abordagem Escolhida*: Armazenamento automático em `localStorage` estruturado com chaves dedicadas para entregas, metas/custos e preferências de mapa, aliado a exportação imediata em CSV (para planilhas) e JSON (backup completo com coordenadas das rotas) e importação com validação.
  - *Por quê*: Funciona instantaneamente sem exigir login, preserva todas as rotas gravadas no próprio aparelho do entregador e permite backup seguro a qualquer momento.

---

## 4. Technical Architecture & Data Strategy

### Diagrama de Arquitetura e Componentes

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                     ESTAÇÃO DO ENTREGADOR (React Application)                │
├──────────────────────────────────────┬───────────────────────────────────────┤
│        CAMADA DE GEOLOCALIZAÇÃO      │       CAMADA DE DADOS & ESTADO        │
│  • GPS Tracker (watchPosition)       │  • LocalStorage Sync Engine           │
│  • Filtro Haversine & Odômetro Live  │  • Entregas, Trajetos & Custos (R$/km)│
│  • Web Audio & Browser Notifications │  • Motor de Filtros & Agregação       │
└──────────────────┬───────────────────┴───────────────────┬───────────────────┘
                   │                                       │
                   ▼                                       ▼
┌──────────────────────────────────────┐ ┌─────────────────────────────────────┐
│     VIEWPORT DO MAPA INTERATIVO      │ │   PAINÉIS DE OPERAÇÃO & CONTROLE    │
│  (@vis.gl/react-google-maps)         │ │                                     │
│  • Heatmap Demanda (Places API New)  │ │  1. HUD de Entrega em Andamento     │
│  • Heatmap Pessoal (Minhas Entregas) │ │     (Iniciar / Pausar / Finalizar)  │
│  • Camadas: Trânsito, Bike & Clima   │ │  2. Modal Rápido de Registro (R$)   │
│  • Polyline Ao Vivo & Replay Engine  │ │     (Entrega + Gorjeta + App + Obs) │
│  • Marcadores Avançados (Restaurantes│ │  3. Calculadora Rota Multi-Paradas  │
│    e Pontos de Entrega)              │ │     (Routes API - Modo BICYCLING)   │
└──────────────────────────────────────┘ │  4. Dashboard Financeiro & Zonas    │
                                         │     (Bruto, Custo Bike, Líquido,    │
                                         │      Gráficos, Ranking de Zonas)    │
                                         │  5. Metas Diárias & Backup CSV/JSON │
                                         └─────────────────────────────────────┘
```

### Modelo de Dados Principal
- **`DeliveryRecord` (Registro de Entrega)**:
  - `id`, `date` (ISO timestamp), `periodOfDay` (`manha` | `almoco` | `tarde` | `jantar` | `madrugada`)
  - `app` (`iFood` | `Uber Eats` | `Rappi` | `Outro`)
  - `baseValue` (R$), `tipValue` (R$), `totalGross` (R$), `operationalCost` (R$ calculado via km × custo/km), `netProfit` (R$ lucro líquido)
  - `distanceKm` (número real), `durationSeconds` (tempo gasto)
  - `zoneName` (bairro/região identificada automaticamente ou informada)
  - `notes` (observações), `isManual` (booleano)
  - `routePath`: lista de pontos `{ lat, lng, timestamp, speed }` para desenho e Replay da rota.
- **`CourierGoalsAndConfig` (Metas e Configurações)**:
  - `dailyEarningsGoal` (R$), `dailyKmGoal` (km), `costPerKm` (R$/km para bike), `theme` (`dark` | `light`), flags de controle de alertas disparados no dia.

### Mapeamento de Interações e Integrações
- **Busca de Demanda de Restaurantes (Places API New)**: Consulta estabelecimentos próximos ao centro do mapa (`Place.searchNearby` / `Place.searchByText`), aplicando em tempo real os filtros de **Avaliação Mínima**, **Aberto Agora** e **Tipo de Comida**, alimentando os pesos do Heatmap de Demanda.
- **Calculadora de Rota Multi-Paradas para Bike (Routes API)**: Permite adicionar ponto de partida e múltiplas paradas (coleta e clientes) com autocompletar de endereço, calculando a rota ideal para bicicleta (`Route.computeRoutes` com `travelMode: 'BICYCLING'`), exibindo distância total, tempo estimado de pedalada e desenhando a linha planejada no mapa.
- **Widget e Camada de Clima**: Consulta em tempo real as condições meteorológicas na coordenada atual do entregador (temperatura, velocidade do vento, precipitação e condição do céu) para alertar sobre chuva ou vento forte durante o turno.
